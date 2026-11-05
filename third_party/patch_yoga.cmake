# FetchContent can revisit its patch step without replacing the source tree.
foreach(patch yoga_intrinsic_basis.patch yoga_max_content_basis.patch)
  set(path "${PATCH_DIR}/${patch}")
  execute_process(
    COMMAND "${GIT_EXECUTABLE}" apply --reverse --check "${path}"
    WORKING_DIRECTORY "${SOURCE_DIR}"
    RESULT_VARIABLE already_applied OUTPUT_QUIET ERROR_QUIET)
  if(already_applied EQUAL 0)
    continue()
  endif()

  execute_process(
    COMMAND "${GIT_EXECUTABLE}" apply "${path}"
    WORKING_DIRECTORY "${SOURCE_DIR}"
    RESULT_VARIABLE applied ERROR_VARIABLE error)
  if(NOT applied EQUAL 0)
    message(FATAL_ERROR "Cannot apply Yoga correction ${patch}: ${error}")
  endif()
endforeach()
