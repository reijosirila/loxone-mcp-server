/* eslint-disable no-console */
import { singleton, inject } from 'tsyringe';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export interface LoggerConfig {
  transport: 'stdio' | 'http';
  level?: LogLevel;
}

@singleton()
export class Logger {
  private logLevel: LogLevel;
  
  constructor(@inject('LoggerConfig') private config: LoggerConfig) {
    const envLevel = process.env.LOG_LEVEL;
    let parsedLevel = LogLevel.INFO;
    
    if (envLevel) {
      const numLevel = Number(envLevel);
      if (!isNaN(numLevel) && numLevel >= 0 && numLevel <= 3) {
        parsedLevel = numLevel as LogLevel;
      } else {
        const upperLevel = envLevel.toUpperCase();
        if (upperLevel in LogLevel) {
          parsedLevel = LogLevel[upperLevel as keyof typeof LogLevel] as LogLevel;
        }
      }
    }
    
    this.logLevel = config.level ?? parsedLevel;

    if (this.config.transport === 'stdio') {
      // Suppress ALL console.log output except error to keep stdout clean for MCP
      console.log = (...args: unknown[]) => { this.log(LogLevel.INFO, 'Unknown', 'console.log called', ...args); };
      console.warn = (...args: unknown[]) => { this.log(LogLevel.WARN, 'Unknown', 'console.warn called', ...args); };
      console.debug = (...args: unknown[]) => { this.log(LogLevel.DEBUG, 'Unknown', 'console.debug called', ...args); };
      console.info = (...args: unknown[]) => { this.log(LogLevel.INFO, 'Unknown', 'console.info called', ...args); };
      console.trace = (...args: unknown[]) => { this.log(LogLevel.INFO, 'Unknown', 'console.trace called', ...args); };
    }
  }
  
  private formatMessage(level: string, component: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] [${component}] ${message}`;
  }
  
  private output(...args: unknown[]): void {
    if (this.config.transport === 'stdio') {
      console.error(...args);
    } else {
      switch (this.logLevel) {
        case LogLevel.ERROR:
          console.error(...args);
          break;
        case LogLevel.WARN:
          console.warn(...args);
          break;
        case LogLevel.INFO:
          console.info(...args);
          break;
        case LogLevel.DEBUG:
          console.debug(...args);
          break;
        default:
          console.log(...args);
          break;
      }
    }
  }
  
  private log(level: LogLevel, component: string, message: string, ...args: unknown[]): void {
    if (level <= this.logLevel) {
      const levelName = LogLevel[level];
      const formatted = this.formatMessage(levelName, component, message);
      
      if (args.length > 0) {
        this.output(formatted, ...args);
      } else {
        this.output(formatted);
      }
    }
  }
  
  public error(component: string, message: string, ...args: unknown[]): void {
    this.log(LogLevel.ERROR, component, message, ...args);
  }
  
  public warn(component: string, message: string, ...args: unknown[]): void {
    this.log(LogLevel.WARN, component, message, ...args);
  }
  
  public info(component: string, message: string, ...args: unknown[]): void {
    this.log(LogLevel.INFO, component, message, ...args);
  }
  
  public debug(component: string, message: string, ...args: unknown[]): void {
    this.log(LogLevel.DEBUG, component, message, ...args);
  }
  
  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }
}