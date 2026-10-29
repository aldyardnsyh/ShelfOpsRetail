import { redirect } from "next/navigation";

export default function NewSessionRedirect() {
  redirect("/shelf/new");
}
