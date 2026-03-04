import { redirect } from "next/navigation";

export default function Home() {
  // Redirect to admin dashboard by default
  redirect("/admin/dashboard");
}

