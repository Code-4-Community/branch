import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { TaskCategory } from './category'; // Adjust path as needed

export interface Label {
  id: string;
  name: string;
  color?: string;
}

@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column({ nullable: true })
  description: string;

  @CreateDateColumn()
  dateCreated: Date;

  @Column({ nullable: true })
  dueDate?: Date;

  @Column('jsonb', { default: () => "'[]'" })
  labels: Label[];

  @Column({
    type: 'enum',
    enum: TaskCategory,
    default: TaskCategory.DRAFT,
  })
  category: TaskCategory;
}
