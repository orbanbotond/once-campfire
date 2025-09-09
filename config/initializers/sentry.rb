if Rails.env.production? && ENV["SKIP_TELEMETRY"].blank?
  Sentry.init do |config|
    config.dsn = Rails.application.credentials.fetch(:sentry_key, '')
    config.breadcrumbs_logger = [ :active_support_logger, :http_logger ]
    config.send_default_pii = false
    config.release = ENV["GIT_REVISION"]
  end
end
