import nodemailer from "nodemailer";
import { render } from "@react-email/render";
import type { ReactElement } from "react";

if (!process.env.GMAIL_USER) {
  throw new Error("GMAIL_USER is not set");
}

if (!process.env.GMAIL_APP_PASSWORD) {
  throw new Error("GMAIL_APP_PASSWORD is not set");
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const FROM_ADDRESS = `Online Voting System <${process.env.GMAIL_USER}>`;

type SendEmailInput = {
  to: string;
  subject: string;
  react: ReactElement;
};

export async function sendEmail({ to, subject, react }: SendEmailInput) {
  const html = await render(react);

  await transporter.sendMail({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
  });
}
