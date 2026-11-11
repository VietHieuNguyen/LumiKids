import { PasswordService } from './password.service.js';

// Local provisioning utility: never writes a secret or inserts an account.
const password = process.env.LUMIKIDS_PASSWORD;
if (!password || password.length < 12 || password.length > 256) {
  console.error(
    'Set LUMIKIDS_PASSWORD in this process to a password of 12–256 characters.',
  );
  process.exitCode = 1;
} else {
  console.log(await new PasswordService().hash(password));
}
