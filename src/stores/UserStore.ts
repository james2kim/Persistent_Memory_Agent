import type { Knex } from 'knex';
import { db } from '../db/knex';
import type { User, CreateUser } from '../schemas/types';

export class UserStoreClass {
  constructor(private knex: Knex) {}

  async create(user: CreateUser): Promise<User> {
    const rows = await this.knex('users')
      .insert({
        email: user.email,
        password_hash: user.password_hash ?? null,
        name: user.name ?? null,
      })
      .returning(['id', 'email', 'password_hash', 'name', 'created_at', 'updated_at']);

    return rows[0];
  }

  async findById(id: string): Promise<User | null> {
    const user = await this.knex('users')
      .select(['id', 'email', 'password_hash', 'name', 'created_at', 'updated_at'])
      .where('id', id)
      .first();

    return user ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = await this.knex('users')
      .select(['id', 'email', 'password_hash', 'name', 'created_at', 'updated_at'])
      .where('email', email)
      .first();

    return user ?? null;
  }

  async update(id: string, updates: Partial<Omit<User, 'id' | 'created_at'>>): Promise<User | null> {
    const rows = await this.knex('users')
      .where('id', id)
      .update({
        ...updates,
        updated_at: this.knex.fn.now(),
      })
      .returning(['id', 'email', 'password_hash', 'name', 'created_at', 'updated_at']);

    return rows[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.knex('users').where('id', id).delete();
    return deleted > 0;
  }

  async findOrCreate(email: string, defaults?: Partial<CreateUser>): Promise<User> {
    const existing = await this.findByEmail(email);
    if (existing) {
      return existing;
    }

    return this.create({
      email,
      ...defaults,
    });
  }
}

export const UserStore = new UserStoreClass(db);
