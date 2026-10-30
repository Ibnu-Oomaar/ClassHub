import { Column, Entity } from 'typeorm';
import { AppBaseEntity } from '../database/base.entity';

/**
 * A subject taught to the class. The table starts empty: the Class Master creates every subject
 * (Physics, Arabic, Islamic, ...) from the dashboard. Nothing limits the count.
 */
@Entity('subjects')
export class Subject extends AppBaseEntity {
  @Column({ type: 'varchar', length: 100 })
  name: string;

  /** Lower-cased, whitespace-collapsed name. Unique, so "physics" and "Physics " cannot both exist. */
  @Column({ type: 'varchar', length: 100, name: 'name_key', unique: true })
  nameKey: string;

  /** Optional short code such as PHY. Stored upper-case. */
  @Column({ type: 'varchar', length: 20, nullable: true, unique: true })
  code: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;
}
