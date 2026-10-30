import { Injectable } from '@nestjs/common';

/**
 * Remembers whether a restore is replacing the database right now. While it is, every other
 * request is answered with 503, so nobody reads half-restored data or writes into tables that are
 * about to be replaced.
 */
@Injectable()
export class MaintenanceState {
  private restoring = false;

  get isRestoring(): boolean {
    return this.restoring;
  }

  begin(): void {
    this.restoring = true;
  }

  end(): void {
    this.restoring = false;
  }
}
