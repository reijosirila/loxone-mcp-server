import 'reflect-metadata';
import { container, DependencyContainer } from 'tsyringe';
import type {
  LoxoneConfig,
  StructureFile
} from './types/structure.js';
import { Logger } from '../../utils/Logger.js';

// Services
import { ConnectionManager } from './services/ConnectionManager.js';
import { StateManager } from './services/StateManager.js';
import { ControlManager } from './services/ControlManager.js';
import { TimeService } from './services/TimeService.js';
import { StatisticsService } from './services/StatisticsService.js';
import { EventHandlerService } from './services/EventHandlerService.js';
import { CloudDiscoveryService } from './services/CloudDiscoveryService.js';
//import { CloudDiscoveryService } from './services/CloudDiscoveryService.js';

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
  private options: Partial<LoxoneConfig>;

  constructor(options: Partial<LoxoneConfig>) {
    this.options = { ...options };
    // Create a scoped container for this instance
    this.scopedContainer = container.createChildContainer();
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

  public async open(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('LoxoneSystem', 'Already initialized');
      return;
    }
    try {
      this.logger.info('LoxoneSystem', 'Initializing...');
      // try discovering loxone if hostname not provided
      if (!this.options.host && this.options.serialNumber) {
        this.options = {
          ...this.options,
          ...await this.discoverCloudMiniserver(this.options.serialNumber),
        }
      }
      this.connectionManager.on('structureLoaded', async (structure: StructureFile) => {
        this.logger.info('LoxoneSystem', 'Structure loaded');
        await this.controlManager.updateStructure(structure);
        await this.timeService.updateStructure(structure);
        await this.statisticsService.updateStructure(structure);
      });
      // Connect and load structure
      await this.connectionManager.initialize(this.options)
        .connect();

      this.initialized = true;
      this.logger.info('LoxoneSystem', 'Initialization complete');
    } catch (error) {
      this.logger.error('LoxoneSystem', 'Initialization failed:', error);
      throw error;
    }
  }

  private async discoverCloudMiniserver(serialNumber: string): Promise<Partial<LoxoneConfig>> {
    this.logger.info('ConnectionManager', 'Discovering Cloud Miniserver...');
    const cloudDiscoveryResult = await CloudDiscoveryService
          .discoverMiniserver(serialNumber);
    this.logger.info('ConnectionManager', `Discovered Cloud Miniserver... ${cloudDiscoveryResult.fullUrl}`);
    return {
      host: cloudDiscoveryResult.host,
      port: cloudDiscoveryResult.port,
      protocol: cloudDiscoveryResult.protocol,
      wsProtocol: cloudDiscoveryResult.wsProtocol,
    }
  }

  public async shutdown(): Promise<void> {
    this.logger.info('LoxoneSystem', 'Shutting down...');
    // Clean up services in reverse order of dependency
    this.eventHandlerService.cleanup();
    this.stateManager.cleanup();
    await this.connectionManager.close();
    this.initialized = false;
    this.logger.info('LoxoneSystem', 'Shutdown complete');
  }
}