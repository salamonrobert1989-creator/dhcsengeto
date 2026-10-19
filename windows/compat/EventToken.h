// WinRT event-token ABI, for toolchains whose Windows headers omit EventToken.h.
// WebView2 uses this value only as an opaque event-registration identifier.
#pragma once
typedef struct EventRegistrationToken {
  INT64 value;
} EventRegistrationToken;
