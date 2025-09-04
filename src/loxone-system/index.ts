import 'reflect-metadata';
import { container, DependencyContainer } from 'tsyringe';
import type {
  LoxoneConfig,
  StructureFile
} from './types/structure.js';
import { Logger } from '../utils/Logger.js';

// Services
import { ConnectionManager } from './services/ConnectionManager.js';
import { StateManager } from './services/StateManager.js';
import { ControlManager } from './services/ControlManager.js';
import { TimeService } from './services/TimeService.js';
import { StatisticsService } from './services/StatisticsService.js';
import { EventHandlerService } from './services/EventHandlerService.js';

export class LoxoneSystem {
  public readonly connectionManager: ConnectionManager;
  public readonly controlManager: ControlManager;
  public readonly statisticsService: StatisticsService;
  private initialized: boolean = false;
  private eventHandlerService: EventHandlerService;
  private stateManager: StateManager;
  private timeService: TimeService;
  private readonly scopedContainer: DependencyContainer;
  private logger: Logger;

  constructor(private readonly config: LoxoneConfig) {
    // Create a scoped container for this instance
    this.scopedContainer = container.createChildContainer();
    
    // Register config
    this.scopedContainer.register<LoxoneConfig>('LoxoneConfig', { useValue: this.config });
    
    // Register services as singletons within this scope
    this.scopedContainer.registerSingleton(StateManager);
    this.scopedContainer.registerSingleton(ConnectionManager);
    this.scopedContainer.registerSingleton(EventHandlerService);
    this.scopedContainer.registerSingleton(ControlManager);
    this.scopedContainer.registerSingleton(TimeService);
    this.scopedContainer.registerSingleton(StatisticsService);
    
    // Resolve all services from the scoped container
    this.connectionManager = this.scopedContainer.resolve(ConnectionManager);
    this.eventHandlerService = this.scopedContainer.resolve(EventHandlerService);
    this.stateManager = this.scopedContainer.resolve(StateManager);
    this.controlManager = this.scopedContainer.resolve(ControlManager);
    this.timeService = this.scopedContainer.resolve(TimeService);
    this.statisticsService = this.scopedContainer.resolve(StatisticsService);
    
    // Get logger from parent container
    this.logger = container.resolve(Logger);
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('LoxoneSystem', 'Already initialized');
      return;
    }

    try {
      this.logger.info('LoxoneSystem', 'Initializing...');
      this.connectionManager.on('structureLoaded', async (structure: StructureFile) => {
        this.logger.info('LoxoneSystem', 'Structure loaded');
        await this.controlManager.updateStructure(structure);
        await this.timeService.updateStructure(structure);
        await this.statisticsService.updateStructure(structure);
      });
      // Connect and load structure
      await this.connectionManager.connect();
      this.initialized = true;
      this.logger.info('LoxoneSystem', 'Initialization complete');
    } catch (error) {
      this.logger.error('LoxoneSystem', 'Initialization failed:', error);
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    this.logger.info('LoxoneSystem', 'Shutting down...');
    await this.connectionManager.close();
    this.initialized = false;
    this.logger.info('LoxoneSystem', 'Shutdown complete');
  }
}