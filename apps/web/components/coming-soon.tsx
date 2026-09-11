import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Temporary placeholder for screens not yet ported. Replaced by the real
 * screen as each one is built.
 */
export function ComingSoon({
  title,
  description = "Dieser Bereich wird gerade aufgebaut.",
  icon = "sparkles",
}: {
  title: string;
  description?: string;
  icon?: string;
}) {
  return (
    <Card padding="none">
      <EmptyState icon={icon} title={title} description={description} />
    </Card>
  );
}
