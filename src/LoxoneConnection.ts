/**
 * Backward compatibility wrapper for LoxoneConnection
 * Delegates to the new LoxoneSystem architecture
 */

import { LoxoneSystem } from './loxone-system/index.js';
import type {
  LoxoneConfig,
  Room,
  Category,
  StatisticsPeriod
} from './loxone-system/types/structure.js';
import type { AbstractControlType } from './loxone-system/control-types/AbstractControlType.js';
import type { StatisticsResponse } from './loxone-system/types/statistics.js';

export class LoxoneConnection {
  private system: LoxoneSystem;

  constructor(config: LoxoneConfig) {
    this.system = new LoxoneSystem(config);
  }

  public async connect() {
    await this.system.initialize();
  }

  public async close() {
    await this.system.shutdown();
  }

  public getRooms(): Room[] {
    return this.system.controlManager.getRooms();
  }

  public getCategories(): Category[] {
    return this.system.controlManager.getCategories();
  }

  public getControls(roomUuid?: string | null, categoryUuid?: string | null) {
    return this.system.controlManager.getControls(roomUuid, categoryUuid);
  }

  public getControl(uuid: string): AbstractControlType {
    return this.system.controlManager.getControl(uuid);
  }

  public async setControl(uuid: string, command: string, value?: unknown)  {
    return this.system.controlManager.setControl(uuid, command, value);
  }
  public isConnected(): boolean {
    return this.system.connectionManager.isConnected();
  }

  public async getStatistics(controlUuid: string, period: StatisticsPeriod): Promise<StatisticsResponse> {
    return this.system.statisticsService.getStatistics(controlUuid, period);
  }
}