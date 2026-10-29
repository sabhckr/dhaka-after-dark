import { createFileRoute } from "@tanstack/react-router";
import { Showroom } from "@/viewer/Showroom";

export const Route = createFileRoute("/showroom")({
  component: Showroom,
});
