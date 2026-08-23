# Reuse the analysis project's restored renv library when running locally.
shared_r_library <- file.path(
  "/srv/projects/Sun_Data_Analytics_Analyze_Talent_Data",
  "renv/library/linux-debian-trixie/R-4.5/x86_64-pc-linux-gnu"
)

if (dir.exists(shared_r_library)) {
  .libPaths(unique(c(shared_r_library, .libPaths())))
}

rm(shared_r_library)
