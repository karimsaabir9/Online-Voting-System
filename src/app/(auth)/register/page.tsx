import Link from "next/link"

import { RegisterForm } from "@/features/auth/components/register-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create an account</CardTitle>
        <CardDescription>
          Register as a voter to participate in elections.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RegisterForm />
        <div className="text-center text-sm">
          <Link href="/login" className="text-muted-foreground hover:text-foreground">
            Already have an account? Log in
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
