import { injectable } from 'tsyringe';
import type { StateValue } from '../types/structure.js';

/**
 * StateManager maintains the current state of all Loxone controls.
 * 
 * Responsibilities:
 * - Stores and manages real-time state values for all controls
 * - Provides fast in-memory cache for control states
 * - Tracks last update timestamps for each state change
 * - Offers CRUD operations for state management (get, set, update, delete)
 * - Maintains state consistency across the application
 * - Enables efficient state retrieval without querying the Miniserver
 * 
 * This service acts as the central state store for all Loxone control values,
 * ensuring consistent and performant access to current device states.
 */
@injectable()
export class StateManager {
  private stateCache: Map<string, StateValue> = new Map();
  /**
   * Get a state value by UUID
   */
  public get(uuid: string): StateValue | undefined {
    return this.stateCache.get(uuid);
  }

  /**
   * Set a state value
   */
  public set(uuid: string, value: StateValue): void {
    this.stateCache.set(uuid, value);
  }

  /**
   * Update only the value of an existing state
   */
  public updateValue(uuid: string, value: unknown): void {
    const newState: StateValue = {
      uuid,
      value,
      lastUpdated: new Date()
    };
    
    this.set(uuid, newState);
  }

  /**
   * Delete a state value
   */
  public delete(uuid: string): boolean {
    const existed = this.stateCache.delete(uuid);
    return existed;
  }

  /**
   * Clear all state values
   */
  public clear(): void {
    this.stateCache.clear();
  }

  /**
   * Get all states (returns a copy to prevent external mutations)
   */
  public getAll(): Map<string, StateValue> {
    return new Map(this.stateCache);
  }

  /**
   * Get state value directly (without the StateValue wrapper)
   */
  public getValue(uuid: string): unknown {
    return this.stateCache.get(uuid)?.value;
  }

  /**
   * Check if a state exists
   */
  public has(uuid: string): boolean {
    return this.stateCache.has(uuid);
  }

  /**
   * Get the size of the state cache
   */
  public get size(): number {
    return this.stateCache.size;
  }
}