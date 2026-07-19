import { sendEmail } from "@/lib/resend";
import { VerifyEmailTemplate } from "./verify-email-template";
import { ResetPasswordTemplate } from "./reset-password-template";

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
