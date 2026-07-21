import { sendEmail } from "@/lib/resend";
import { VerifyEmailTemplate } from "./verify-email-template";
import { ResetPasswordTemplate } from "./reset-password-template";
import { ChangeEmailTemplate } from "./change-email-template";

export async function sendVerificationEmail(
  to: string,
  url: string,
  name: string
) {
  await sendEmail({
    to,
    subject: "Verify your email — Online Voting System",
    react: <VerifyEmailTemplate name={name} url={url} />,
  });
}

export async function sendPasswordResetEmail(
  to: string,
  url: string,
  name: string
) {
  await sendEmail({
    to,
    subject: "Reset your password — Online Voting System",
    react: <ResetPasswordTemplate name={name} url={url} />,
  });
}

export async function sendChangeEmailConfirmationEmail(
  to: string,
  url: string,
  name: string,
  newEmail: string
) {
  await sendEmail({
    to,
    subject: "Confirm your new email — Online Voting System",
    react: <ChangeEmailTemplate name={name} url={url} newEmail={newEmail} />,
  });
}
