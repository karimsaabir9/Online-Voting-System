type ChangeEmailTemplateProps = {
  name: string;
  url: string;
  newEmail: string;
};

export function ChangeEmailTemplate({ name, url, newEmail }: ChangeEmailTemplateProps) {
  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20 }}>Confirm your new email address</h1>
      <p>Hi {name},</p>
      <p>
        We received a request to change your Online Voting System email to{" "}
        <strong>{newEmail}</strong>. Click the button below to confirm this change. This
        link expires in 1 hour.
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
        Confirm email change
      </a>
      <p style={{ color: "#6b7280", fontSize: 12, marginTop: 24 }}>
        If you didn&apos;t request this, you can safely ignore this email — your email
        address will not change.
      </p>
    </div>
  );
}
