module.exports = {
  apps: [
    {
      name: "gmb-backend",
      cwd: "./backend",
      script: "server.js",
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      restart_delay: 5000,
      max_restarts: 10,
    },
    {
      name: "gmb-frontend",
      cwd: "./frontend",
      script: "node_modules/.bin/next",
      args: "start -p 3001",
      env_production: {
        NODE_ENV: "production",
        PORT: 3001,
      },
      restart_delay: 5000,
      max_restarts: 10,
    },
  ],
};
