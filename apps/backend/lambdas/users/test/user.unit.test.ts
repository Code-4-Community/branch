import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock the database module BEFORE importing handler
jest.mock('../db');

import { handler } from '../handler';
import db from '../db';

const mockDb = db as any;

// Helper function to create a POST event
function postEvent(body: Record<string, unknown>) {
  return {
    rawPath: '/users',
    requestContext: {
      http: {
        method: 'POST',
      },
    },
    body: JSON.stringify(body),
  };
}

describe('POST /users unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Input Validation', () => {
    test('400: missing email field', async () => {
      const res = await handler(
        postEvent({
          name: 'John Doe',
          isAdmin: false,
        })
      );

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toBeDefined();
      expect(json.message).toContain('required');
    });

    test('400: missing name field', async () => {
      const res = await handler(
        postEvent({
          email: 'john@example.com',
          isAdmin: false,
        })
      );

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toBeDefined();
      expect(json.message).toContain('required');
    });

    test('400: missing isAdmin field', async () => {
      const res = await handler(
        postEvent({
          name: 'John Doe',
          email: 'john@example.com',
        })
      );

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toBeDefined();
      expect(json.message).toContain('required');
    });

    test('400: isAdmin is not a boolean', async () => {
      const res = await handler(
        postEvent({
          name: 'John Doe',
          email: 'john@example.com',
          isAdmin: 'yes',
        })
      );

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toBeDefined();
      expect(json.message).toContain('required');
    });

    test('400: empty email field', async () => {
      const res = await handler(
        postEvent({
          name: 'John Doe',
          email: '',
          isAdmin: false,
        })
      );

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toContain('required');
    });

    test('400: empty name field', async () => {
      const res = await handler(
        postEvent({
          name: '',
          email: 'john@example.com',
          isAdmin: false,
        })
      );

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toContain('required');
    });
  });

  describe('Response Format', () => {
  });

  describe('Success Cases', () => {
    test('201: successful POST returns 201 status and correct response shape', async () => {
      // Setup mocks for successful user creation
      // Mock the email check to return null (user doesn't exist)
      const whereChain = {
        selectAll: jest.fn().mockReturnValue({
          executeTakeFirst: (jest.fn() as any).mockResolvedValue(null),
        }),
      };
      mockDb.selectFrom.mockReturnValue({
        where: jest.fn().mockReturnValue(whereChain),
      });

      // Mock the insert
      mockDb.insertInto.mockReturnValue({
        values: jest.fn().mockReturnValue({
          execute: (jest.fn() as any).mockResolvedValue(undefined),
        }),
      });

      const res = await handler(
        postEvent({
          name: 'John Doe',
          email: 'john@example.com',
          isAdmin: false,
        })
      );

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json).toHaveProperty('ok');
      expect(json).toHaveProperty('route');
      expect(json).toHaveProperty('pathParams');
      expect(json).toHaveProperty('body');
    });

    test('409: returns 409 when user already exists', async () => {
      // Mock: user already exists
      const whereChain = {
        selectAll: jest.fn().mockReturnValue({
          executeTakeFirst: (jest.fn() as any).mockResolvedValue({
            user_id: 1,
            name: 'Existing User',
            email: 'existing@example.com',
            is_admin: false,
            created_at: new Date(),
          }),
        }),
      };
      mockDb.selectFrom.mockReturnValue({
        where: jest.fn().mockReturnValue(whereChain),
      });

      const res = await handler(
        postEvent({
          name: 'New User',
          email: 'existing@example.com',
          isAdmin: true,
        })
      );

      expect(res.statusCode).toBe(409);
      const json = JSON.parse(res.body);
      expect(json).toHaveProperty('message');
    });
  });
});
