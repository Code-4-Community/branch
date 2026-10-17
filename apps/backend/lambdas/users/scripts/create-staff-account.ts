// The only way a staff account is created: no route can set users.is_staff.
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { closeConnection, createStaffUser } from '@branch/store';
import { UserValidationUtils } from '../validation-utils';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main(): Promise<void> {
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const email = UserValidationUtils.validateEmail(arg('email'));
  const name = UserValidationUtils.validateName(arg('name'));
  if (!userPoolId || !email.isValid || !email.value || !name.isValid || !name.value) {
    throw new Error(
      'usage: COGNITO_USER_POOL_ID=... npm run create-staff -- --email <email> --name <name>',
    );
  }

  const cognito = new CognitoIdentityProviderClient({
    region: process.env.AWS_REGION || 'us-east-2',
  });
  const created = await cognito.send(
    new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: email.value,
      DesiredDeliveryMediums: ['EMAIL'],
      UserAttributes: [
        { Name: 'email', Value: email.value },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'name', Value: name.value },
      ],
    }),
  );
  const sub = created.User?.Attributes?.find((a) => a.Name === 'sub')?.Value;
  if (!sub) throw new Error('AdminCreateUser returned no sub');

  try {
    const userId = await createStaffUser({ cognitoSub: sub, email: email.value, name: name.value });
    console.log(`staff account ${userId} created for ${email.value}; invite sent`);
  } catch (err) {
    await cognito.send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: email.value }));
    throw err;
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeConnection());
