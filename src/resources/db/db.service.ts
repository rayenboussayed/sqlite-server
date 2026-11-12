import { Injectable } from '@nestjs/common';
import { Database } from '../../database.js';
import { environment } from '../../environment.js';

@Injectable()
export class DbService {
  public readonly database = Database.new(environment.SQLITE_DATABASE_PATH);

  query() {
    this.database.exec();
  }
}
