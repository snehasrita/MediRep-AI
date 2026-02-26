import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Allow Supabase Storage public object URLs (license images, avatars, etc.)
    remotePatterns: [
      {
        protocol: "https",
        hostname: "oaskvfqytsexurcgfafo.supabase.co",
        pathname: "/storage/v1/object/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
