namespace :db do
  desc 'Backup production database from remote server'
  task backup: :environment do
    DatabaseBackup.run
  end
end