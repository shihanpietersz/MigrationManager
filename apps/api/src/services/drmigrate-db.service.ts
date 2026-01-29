import sql from 'mssql';

/**
 * Configuration for connecting to a DrMigrate SQL Server database
 */
export interface DrMigrateConnectionConfig {
  server: string;
  database: string;
  user: string;
  password: string;
  port?: number;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
}

/**
 * Result of a connection test
 */
export interface ConnectionTestResult {
  success: boolean;
  message: string;
  details?: {
    serverVersion?: string;
    databaseName?: string;
  };
}

/**
 * Service for managing connections to DrMigrate SQL Server databases
 * This is used to import migration plans (waves, sync groups, environments)
 * from existing DrMigrate installations
 */
class DrMigrateDbService {
  private pools: Map<string, sql.ConnectionPool> = new Map();

  /**
   * Build SQL Server connection configuration from our config format
   */
  private buildSqlConfig(config: DrMigrateConnectionConfig): sql.config {
    return {
      server: config.server,
      database: config.database,
      user: config.user,
      password: config.password,
      port: config.port || 1433,
      options: {
        encrypt: config.encrypt ?? false, // SQL Express typically doesn't use encryption
        trustServerCertificate: config.trustServerCertificate ?? true, // Trust for local/dev
        enableArithAbort: true,
      },
      connectionTimeout: 15000, // 15 seconds
      requestTimeout: 30000, // 30 seconds
    };
  }

  /**
   * Generate a unique key for the connection pool cache
   */
  private getPoolKey(config: DrMigrateConnectionConfig): string {
    return `${config.server}:${config.port || 1433}:${config.database}:${config.user}`;
  }

  /**
   * Test connection to a DrMigrate SQL Server database
   * @param config Connection configuration
   * @returns Test result with success status and message
   */
  async testConnection(config: DrMigrateConnectionConfig): Promise<ConnectionTestResult> {
    let pool: sql.ConnectionPool | null = null;

    try {
      const sqlConfig = this.buildSqlConfig(config);
      pool = new sql.ConnectionPool(sqlConfig);
      
      await pool.connect();

      // Run a simple query to verify the connection works
      const result = await pool.request().query(`
        SELECT 
          @@VERSION as ServerVersion,
          DB_NAME() as DatabaseName
      `);

      const serverVersion = result.recordset[0]?.ServerVersion || 'Unknown';
      const databaseName = result.recordset[0]?.DatabaseName || config.database;

      // Extract just the first line of the version (it can be very long)
      const versionFirstLine = serverVersion.split('\n')[0].trim();

      return {
        success: true,
        message: `Successfully connected to ${databaseName}`,
        details: {
          serverVersion: versionFirstLine,
          databaseName,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Provide more user-friendly error messages
      let friendlyMessage = errorMessage;
      if (errorMessage.includes('ECONNREFUSED')) {
        friendlyMessage = `Unable to connect to server "${config.server}". Please check the server name and ensure SQL Server is running.`;
      } else if (errorMessage.includes('Login failed')) {
        friendlyMessage = 'Login failed. Please check your username and password.';
      } else if (errorMessage.includes('Cannot open database')) {
        friendlyMessage = `Database "${config.database}" not found. Please check the database name.`;
      } else if (errorMessage.includes('ETIMEOUT')) {
        friendlyMessage = `Connection timed out. Please check the server name and network connectivity.`;
      }

      return {
        success: false,
        message: friendlyMessage,
      };
    } finally {
      // Always close the test connection
      if (pool) {
        try {
          await pool.close();
        } catch {
          // Ignore close errors
        }
      }
    }
  }

  /**
   * Get or create a connection pool for the given configuration
   * Pools are cached for reuse across multiple queries
   * @param config Connection configuration
   * @returns Connection pool
   */
  async getPool(config: DrMigrateConnectionConfig): Promise<sql.ConnectionPool> {
    const key = this.getPoolKey(config);
    
    // Check if we already have a connected pool
    const existingPool = this.pools.get(key);
    if (existingPool && existingPool.connected) {
      return existingPool;
    }

    // Create new pool
    const sqlConfig = this.buildSqlConfig(config);
    const pool = new sql.ConnectionPool(sqlConfig);
    
    await pool.connect();
    this.pools.set(key, pool);
    
    return pool;
  }

  /**
   * Close a specific connection pool
   * @param config Connection configuration identifying the pool
   */
  async closePool(config: DrMigrateConnectionConfig): Promise<void> {
    const key = this.getPoolKey(config);
    const pool = this.pools.get(key);
    
    if (pool) {
      try {
        await pool.close();
      } catch {
        // Ignore close errors
      }
      this.pools.delete(key);
    }
  }

  /**
   * Close all connection pools
   * Should be called on application shutdown
   */
  async closeAllPools(): Promise<void> {
    const closePromises = Array.from(this.pools.values()).map(async (pool) => {
      try {
        await pool.close();
      } catch {
        // Ignore close errors
      }
    });

    await Promise.all(closePromises);
    this.pools.clear();
  }

  /**
   * Serialize connection config to a JSON string for storage
   * Note: In production, this should be encrypted
   * @param config Connection configuration
   * @returns JSON string
   */
  serializeConfig(config: DrMigrateConnectionConfig): string {
    return JSON.stringify({
      server: config.server,
      database: config.database,
      user: config.user,
      password: config.password, // TODO: Encrypt in production
      port: config.port || 1433,
      encrypt: config.encrypt ?? false,
      trustServerCertificate: config.trustServerCertificate ?? true,
    });
  }

  /**
   * Deserialize connection config from a JSON string
   * @param json JSON string
   * @returns Connection configuration
   */
  deserializeConfig(json: string): DrMigrateConnectionConfig {
    const parsed = JSON.parse(json);
    return {
      server: parsed.server,
      database: parsed.database,
      user: parsed.user,
      password: parsed.password, // TODO: Decrypt in production
      port: parsed.port || 1433,
      encrypt: parsed.encrypt ?? false,
      trustServerCertificate: parsed.trustServerCertificate ?? true,
    };
  }
}

// Export singleton instance
export const drMigrateDbService = new DrMigrateDbService();
