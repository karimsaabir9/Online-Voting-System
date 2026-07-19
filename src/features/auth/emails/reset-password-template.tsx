type ResetPasswordTemplateProps = {
  name: string;
  url: string;
};

export function ResetPasswordTemplate({ name, url }: ResetPasswordTemplateProps) {
  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20 }}>Reset your password</h1>
      <p>Hi {name},</p>
      <p>
        We received a request to reset your Online Voting System password.
        Click the button below to choose a new one. This link expires in 1
        hour.
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
        Reset password
      </a>
      <p style={{ color: "#6b7280", fontSize: 12, marginTop: 24 }}>
        If you didn&apos;t request this, you can safely ignore this email —
        your password will not change.
      </p>
    </div>
  );
}
