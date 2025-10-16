import { handler } from './handler';
import { getDatabase } from './database';
import { APIGatewayProxyEvent } from 'aws-lambda';

// Mock event creator
function createEvent(
  method: string,
  path: string,
  body?: any
): Partial<APIGatewayProxyEvent> {
  return {
    httpMethod: method,
    path: path,
    body: body ? JSON.stringify(body) : null,
    headers: {},
    queryStringParameters: null,
    pathParameters: null,
    requestContext: {} as any,
    resource: path,
    stageVariables: null,
    isBase64Encoded: false,
  };
}

describe('PATCH /users/{userId}', () => {
  let testUserId: number;
  const db = getDatabase();

  beforeAll(async () => {
    // Create a test user
    const result = await db
      .insertInto('user')
      .values({
        email: 'test-update@example.com',
        password: 'password123',
        name: 'Original Name',
        isAdmin: 0,
      })
      .execute();
    
    // Get the inserted user's ID
    const user = await db
      .selectFrom('user')
      .select('id')
      .where('email', '=', 'test-update@example.com')
      .executeTakeFirstOrThrow();
    
    testUserId = user.id;
  });

  afterAll(async () => {
    // Clean up test user
    await db
      .deleteFrom('user')
      .where('email', '=', 'test-update@example.com')
      .execute();
  });

  test('should update user name successfully', async () => {
    const event = createEvent('PATCH', `/users/${testUserId}`, {
      name: 'Updated Name',
    });

    const response = await handler(event as any);
    
    expect(response.statusCode).toBe(200);
    
    const body = JSON.parse(response.body);
    expect(body.name).toBe('Updated Name');
    expect(body.email).toBe('test-update@example.com');
    expect(body.id).toBe(testUserId);
    expect(body.isAdmin).toBe(false);
  });

  test('should update user isAdmin successfully', async () => {
    const event = createEvent('PATCH', `/users/${testUserId}`, {
      isAdmin: true,
    });

    const response = await handler(event as any);
    
    expect(response.statusCode).toBe(200);
    
    const body = JSON.parse(response.body);
    expect(body.isAdmin).toBe(true);
    expect(body.email).toBe('test-update@example.com');
  });

  test('should update both name and isAdmin successfully', async () => {
    const event = createEvent('PATCH', `/users/${testUserId}`, {
      name: 'Final Name',
      isAdmin: false,
    });

    const response = await handler(event as any);
    
    expect(response.statusCode).toBe(200);
    
    const body = JSON.parse(response.body);
    expect(body.name).toBe('Final Name');
    expect(body.isAdmin).toBe(false);
  });

  test('should return 404 for non-existent user', async () => {
    const event = createEvent('PATCH', '/users/99999', {
      name: 'Test',
    });

    const response = await handler(event as any);
    
    expect(response.statusCode).toBe(404);
    
    const body = JSON.parse(response.body);
    expect(body.message).toBe('User not found');
  });

  test('should return 400 for invalid user ID format', async () => {
    const event = createEvent('PATCH', '/users/invalid', {
      name: 'Test',
    });

    const response = await handler(event as any);
    
    expect(response.statusCode).toBe(400);
    
    const body = JSON.parse(response.body);
    expect(body.message).toBe('Invalid userId format');
  });

  test('should return 400 when name is not a string', async () => {
    const event = createEvent('PATCH', `/users/${testUserId}`, {
      name: 123,
    });

    const response = await handler(event as any);
    
    expect(response.statusCode).toBe(400);
    
    const body = JSON.parse(response.body);
    expect(body.message).toBe('name must be a string');
  });

  test('should return 400 when isAdmin is not a boolean', async () => {
    const event = createEvent('PATCH', `/users/${testUserId}`, {
      isAdmin: 'yes',
    });

    const response = await handler(event as any);
    
    expect(response.statusCode).toBe(400);
    
    const body = JSON.parse(response.body);
    expect(body.message).toBe('isAdmin must be a boolean');
  });

  test('should return 400 when no fields are provided', async () => {
    const event = createEvent('PATCH', `/users/${testUserId}`, {});

    const response = await handler(event as any);
    
    expect(response.statusCode).toBe(400);
    
    const body = JSON.parse(response.body);
    expect(body.message).toBe('At least one field (name or isAdmin) must be provided');
  });

  test('should return 400 when body is empty', async () => {
    const event = createEvent('PATCH', `/users/${testUserId}`, undefined);
    
    // Set body to empty string to simulate empty request
    event.body = null;

    const response = await handler(event as any);
    
    expect(response.statusCode).toBe(400);
    
    const body = JSON.parse(response.body);
    expect(body.message).toBe('At least one field (name or isAdmin) must be provided');
  });

  test('should handle partial update with only name', async () => {
    // First set both fields
    await db
      .updateTable('user')
      .set({ name: 'Before Partial', isAdmin: 1 })
      .where('id', '=', testUserId)
      .execute();

    // Update only name
    const event = createEvent('PATCH', `/users/${testUserId}`, {
      name: 'After Partial',
    });

    const response = await handler(event as any);
    
    expect(response.statusCode).toBe(200);
    
    const body = JSON.parse(response.body);
    expect(body.name).toBe('After Partial');
    expect(body.isAdmin).toBe(true); // Should remain unchanged
  });

  test('should handle partial update with only isAdmin', async () => {
    // First set both fields
    await db
      .updateTable('user')
      .set({ name: 'Keep This Name', isAdmin: 1 })
      .where('id', '=', testUserId)
      .execute();

    // Update only isAdmin
    const event = createEvent('PATCH', `/users/${testUserId}`, {
      isAdmin: false,
    });

    const response = await handler(event as any);
    
    expect(response.statusCode).toBe(200);
    
    const body = JSON.parse(response.body);
    expect(body.name).toBe('Keep This Name'); // Should remain unchanged
    expect(body.isAdmin).toBe(false);
  });
});
