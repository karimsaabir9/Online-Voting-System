type VerifyEmailTemplateProps = {
  name: string;
  url: string;
};

export function VerifyEmailTemplate({ name, url }: VerifyEmailTemplateProps) {
  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20 }}>Verify your email</h1>
      <p>Hi {name},</p>
      <p>
        Thanks for registering for the Online Voting System. Please verify
        your email address to activate your account.
      </p>
      <a
        href={url}
        style={{
          display: "inline-block",
          padding: "10px 20px",
          background: "#111827",
          color: "#ffffff",
          textDecoration: "none",
          borderRadius: 6,
          marginTop: 12,
        }}
      >
        Verify email
      </a>
      <p style={{ color: "#6b7280", fontSize: 12, marginTop: 24 }}>
        If you didn&apos;t create this account, you can safely ignore this
        email.
      </p>
    </div>
  );
}
