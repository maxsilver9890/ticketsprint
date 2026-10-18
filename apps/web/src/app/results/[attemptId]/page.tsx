import { ResultsClient } from "@/features/booking/ResultsClient";

export default async function ResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return <ResultsClient attemptId={attemptId} />;
}
