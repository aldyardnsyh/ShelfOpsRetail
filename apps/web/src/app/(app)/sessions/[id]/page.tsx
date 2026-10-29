import { redirect } from "next/navigation";

export default async function SessionDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/shelf/${id}`);
}
