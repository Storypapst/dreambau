FROM php:8.2-fpm

LABEL maintainer="WCR Business"
LABEL description="Custom InvoiceNinja v5 - Built from source for customization"

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    libpng-dev \
    libonig-dev \
    libxml2-dev \
    libzip-dev \
    zip \
    unzip \
    libfreetype6-dev \
    libjpeg62-turbo-dev \
    libgd-dev \
    libpq-dev \
    libgmp-dev \
    mariadb-client \
    ghostscript \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install PHP extensions
RUN docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) \
    pdo_mysql \
    pdo_pgsql \
    gd \
    opcache \
    zip \
    bcmath \
    gmp \
    mysqli

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Set working directory
WORKDIR /var/www/app

# Copy InvoiceNinja source code
COPY ./source /var/www/app

# Create .env file from example
RUN cp .env.example .env || true

# Install Node.js and npm for React build (using Debian apt, not Alpine apk)
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Install PHP dependencies
RUN composer install --no-dev --no-interaction --optimize-autoloader

# Install Node.js dependencies and build React app
RUN npm install --legacy-peer-deps

# Build React/Vue application (this builds the frontend assets)
RUN npm run build

# Clean up npm cache to reduce image size
RUN npm cache clean --force && rm -rf node_modules

# Create required Laravel directories
RUN mkdir -p /var/www/app/storage/framework/sessions \
    && mkdir -p /var/www/app/storage/framework/cache \
    && mkdir -p /var/www/app/storage/framework/testing

# Set proper permissions
RUN chown -R www-data:www-data /var/www/app \
    && chmod -R 775 /var/www/app/storage \
    && chmod -R 755 /var/www/app/bootstrap/cache

# Configure PHP-FPM
RUN echo "upload_max_filesize = 100M" > /usr/local/etc/php/conf.d/uploads.ini \
    && echo "post_max_size = 100M" >> /usr/local/etc/php/conf.d/uploads.ini \
    && echo "memory_limit = 512M" >> /usr/local/etc/php/conf.d/uploads.ini \
    && echo "max_execution_time = 300" >> /usr/local/etc/php/conf.d/uploads.ini

# Create necessary directories
RUN mkdir -p /var/www/app/public/storage \
    && chown -R www-data:www-data /var/www/app/public/storage

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \
    CMD php-fpm -t || exit 1

# Expose port
EXPOSE 9000

# Start PHP-FPM
CMD ["php-fpm"]

