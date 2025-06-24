/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:4000/v1/:path*'
      }
    ]
  }
}

module.exports = nextConfig 