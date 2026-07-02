import { redirect } from 'next/navigation';

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  redirect(`/settings/ai/brands/${id}/voice`);
}
