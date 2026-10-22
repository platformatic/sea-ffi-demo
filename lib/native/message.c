#include <stdio.h>
#include <time.h>

#ifdef _WIN32
#define EXPORT __declspec(dllexport)
#else
#define EXPORT __attribute__((visibility("default")))
#endif

EXPORT void print_message(const char *message) {
  printf("[%d] %s\n", (int)time(NULL), message);
  fflush(stdout);
}
