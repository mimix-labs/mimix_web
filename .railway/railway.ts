import { defineRailway, preserve, project, service } from "railway/iac";

export default defineRailway(() => {
  const mimixWeb = service("mimix-web", {
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "/Dockerfile",
    },
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    replicas: { "us-west2": 1 },
    env: { MIMIX_VISION_MODE: preserve() },
  });

  return project("mimix-web", {
    resources: [mimixWeb],
  });
});
