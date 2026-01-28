/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@drmigrate/shared-types'],
  // Rewrites are disabled since we use direct API calls
  // async rewrites() {
  //   return [
  //     {
  //       source: '/api/v1/:path*',
  //       destination: 'http://localhost:4000/api/v1/:path*',
  //     },
  //   ];
  // },
};

module.exports = nextConfig;

