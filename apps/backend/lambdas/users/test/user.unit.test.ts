import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock the database module BEFORE importing handler
jest.mock('../db');

import { handler } from '../handler';
import db from '../db';

const mockDb = db as any;

// Helper function to create a POST event
function postEvent(userId: string, body: Record<string, unknown>) {
  return {
    rawPath: `/${userId}`,
    requestContext: {
      http: {
        method: 'POST',
      },
    },
    body: JSON.stringify(body),
  };
}

describe('POST /users/{userId} unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Input Validation', () => {
    test('400: missing email field', async () => {
      const res = await handler(
        postEvent('test-user-1', {
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
        postEvent('test-user-2', {
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
        postEvent('test-user-3', {
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
        postEvent('test-user-4', {
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
        postEvent('test-user-5', {
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
        postEvent('test-user-6', {
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
    test('404: POST to root path returns not found', async () => {
      const res = await handler({
        rawPath: '/',
        requestContext: {
          http: {
            method: 'POST',
          },
        },
        body: JSON.stringify({
          name: 'John Doe',
          email: 'john@example.com',
          isAdmin: false,
        }),
      });

      expect(res.statusCode).toBe(404);
      const json = JSON.parse(res.body);
      expect(json.message).toBe('Not Found');
      expect(json.path).toBeDefined();
      expect(json.method).toBeDefined();
    });

    test('response has correct HTTP headers', async () => {
      // Setup mocks for successful user creation
      mockDb.selectFrom.mockReturnValue({
        where: jest.fn().mockReturnValue({
          selectAll: jest.fn().mockReturnValue({
            executeTakeFirst: jest.fn().mockReturnValue(null),
          }),
        }),
      });

      mockDb.insertInto.mockReturnValue({
        values: jest.fn().mockReturnValue({
          execute: jest.fn().mockReturnValue(undefined),
        }),
      });

      const res = await handler(
        postEvent('format-test', {
          name: 'Format Test',
          email: 'format@example.com',
          isAdmin: false,
        })
      );

      expect(res.headers?.['Content-Type']).toBe('application/json');
      expect(res.headers?.['Access-Control-Allow-Origin']).toBe('*');
      expect(res.headers?.['Access-Control-Allow-Headers']).toBe('Content-Type,Authorization');
      expect(res.headers?.['Access-Control-Allow-Methods']).toContain('POST');
    });
  });

  describe('Success Cases', () => {
    test('201: successful POST returns 201 status and correct response shape', async () => {
      // Setup mocks for successful user creation
      mockDb.selectFrom.mockReturnValue({
        where: jest.fn().mockReturnValue({
          selectAll: jest.fn().mockReturnValue({
            executeTakeFirst: jest.fn().mockReturnValue(null),
          }),
        }),
      });

      mockDb.insertInto.mockReturnValue({
        values: jest.fn().mockReturnValue({
          execute: jest.fn().mockReturnValue(undefined),
        }),
      });

      const res = await handler(
        postEvent('test-user', {
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
      mockDb.selectFrom.mockReturnValue({
        where: jest.fn().mockReturnValue({
          selectAll: jest.fn().mockReturnValue({
            executeTakeFirst: jest.fn().mockReturnValue({
              user_id: 'existing-user',
              name: 'Existing User',
              email: 'existing@example.com',
              is_admin: false,
              created_at: new Date(),
            }),
          }),
        }),
      });

      const res = await handler(
        postEvent('existing-user', {
          name: 'New User',
          email: 'new@example.com',
          isAdmin: true,
        })
      );

      expect(res.statusCode).toBe(409);
      const json = JSON.parse(res.body);
      expect(json).toHaveProperty('message');
    });
  });
});
