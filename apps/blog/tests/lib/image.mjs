// The nginx image that the page server starts, and that the workflow pulls first. Replaceable by BLOG_NGINX_IMAGE.
export const DEFAULT_IMAGE = 'nginx:1.27-alpine';
export const nginxImage = () => process.env.BLOG_NGINX_IMAGE || DEFAULT_IMAGE;
