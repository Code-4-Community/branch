import { Entity, Column, ObjectIdColumn, ObjectId } from 'typeorm';

import type { Status } from './types';

@Entity()
export class User {
  @Column({ primary: true })
  id: number;

  @Column()
  status: Status;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column()
  email: string;
}
