import { DefaultNamingStrategy, NamingStrategyInterface } from 'typeorm';

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

/**
 * PostgreSQL-friendly column names: `fullName` -> `full_name`, `dueAt` -> `due_at`.
 * Table names and join columns are always declared explicitly on the entities.
 */
export class SnakeNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
  columnName(propertyName: string, customName: string | undefined, embeddedPrefixes: string[]): string {
    if (customName) {
      return customName;
    }
    return toSnakeCase([...embeddedPrefixes, propertyName].join('_'));
  }

  relationName(propertyName: string): string {
    return toSnakeCase(propertyName);
  }

  joinColumnName(relationName: string, referencedColumnName: string): string {
    return toSnakeCase(`${relationName}_${referencedColumnName}`);
  }
}
