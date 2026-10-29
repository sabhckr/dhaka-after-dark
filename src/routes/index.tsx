import { createFileRoute } from "@tanstack/react-router";
import { WorldView } from "@/viewer/WorldView";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <WorldView />;
}
