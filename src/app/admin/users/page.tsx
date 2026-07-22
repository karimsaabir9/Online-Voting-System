import { UsersTable } from "@/features/users/components/users-table"

export default function AdminUsersPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Users</h1>
      <UsersTable />
    </div>
  )
}
