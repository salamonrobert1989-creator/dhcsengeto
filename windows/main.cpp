#ifndef UNICODE
#define UNICODE
#endif
#define _UNICODE
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#define WINVER 0x0A00
#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0A00
#endif
#include <windows.h>
#include <shlobj.h>
#include <shellapi.h>
#include <WebView2.h>
#include "webview_guids.h"
#include <functional>
#include <string>
#include <utility>

namespace {
constexpr wchar_t TITLE[] = L"Dunahíd csengető";
constexpr wchar_t WINDOW_CLASS[] = L"DunahidCsengetoWindow";
constexpr wchar_t HOST[] = L"dunahid.invalid";
constexpr wchar_t HOME[] = L"https://dunahid.invalid/dunahid-csengeto.html";
constexpr UINT_PTR HEARTBEAT = 1;

template<class T> class ComPtr {
  T* pointer_ = nullptr;
public:
  ~ComPtr() { reset(); }
  T* operator->() const { return pointer_; }
  explicit operator bool() const { return pointer_ != nullptr; }
  T** put() { reset(); return &pointer_; }
  void reset(T* value = nullptr) { if (pointer_) pointer_->Release(); pointer_ = value; }
  void retain(T* value) { if (value) value->AddRef(); reset(value); }
};

template<class T> class RefCounted : public T {
  LONG references_ = 1;
  IID iid_;
protected:
  virtual ~RefCounted() = default;
public:
  explicit RefCounted(REFIID iid) : iid_(iid) {}
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid, void** result) override {
    if (!result) return E_POINTER;
    *result = nullptr;
    if (!IsEqualIID(iid, IID_IUnknown) && !IsEqualIID(iid, iid_)) return E_NOINTERFACE;
    *result = static_cast<T*>(this); AddRef(); return S_OK;
  }
  ULONG STDMETHODCALLTYPE AddRef() override { return InterlockedIncrement(&references_); }
  ULONG STDMETHODCALLTYPE Release() override {
    const ULONG count = InterlockedDecrement(&references_);
    if (!count) delete this;
    return count;
  }
};

template<class T, class... Args> class Callback final : public RefCounted<T> {
  std::function<HRESULT(Args...)> callback_;
public:
  Callback(REFIID iid, std::function<HRESULT(Args...)> callback) : RefCounted<T>(iid), callback_(std::move(callback)) {}
  HRESULT STDMETHODCALLTYPE Invoke(Args... args) override { return callback_(args...); }
};
using EnvironmentReady = Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler, HRESULT, ICoreWebView2Environment*>;
using ControllerReady = Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler, HRESULT, ICoreWebView2Controller*>;
using ScriptReady = Callback<ICoreWebView2AddScriptToExecuteOnDocumentCreatedCompletedHandler, HRESULT, LPCWSTR>;
using ScriptExecuted = Callback<ICoreWebView2ExecuteScriptCompletedHandler, HRESULT, LPCWSTR>;
using NavigationStarting = Callback<ICoreWebView2NavigationStartingEventHandler, ICoreWebView2*, ICoreWebView2NavigationStartingEventArgs*>;
using NewWindowRequested = Callback<ICoreWebView2NewWindowRequestedEventHandler, ICoreWebView2*, ICoreWebView2NewWindowRequestedEventArgs*>;
using ProcessFailed = Callback<ICoreWebView2ProcessFailedEventHandler, ICoreWebView2*, ICoreWebView2ProcessFailedEventArgs*>;

HRESULT copyString(const std::wstring& text, LPWSTR* result) {
  if (!result) return E_POINTER;
  *result = static_cast<LPWSTR>(CoTaskMemAlloc((text.size() + 1) * sizeof(wchar_t)));
  if (!*result) return E_OUTOFMEMORY;
  memcpy(*result, text.c_str(), (text.size() + 1) * sizeof(wchar_t));
  return S_OK;
}

class EnvironmentOptions final : public RefCounted<ICoreWebView2EnvironmentOptions> {
  std::wstring arguments_ = L"--autoplay-policy=no-user-gesture-required --disable-background-timer-throttling "
      L"--disable-backgrounding-occluded-windows --disable-renderer-backgrounding "
      L"--disable-features=CalculateNativeWinOcclusion --disk-cache-size=16777216";
  std::wstring language_ = L"hu-HU", version_ = L"110.0.1587.40";
  BOOL singleSignOn_ = FALSE;
public:
  EnvironmentOptions() : RefCounted(IID_EnvironmentOptions) {}
  HRESULT STDMETHODCALLTYPE get_AdditionalBrowserArguments(LPWSTR* value) override { return copyString(arguments_, value); }
  HRESULT STDMETHODCALLTYPE put_AdditionalBrowserArguments(LPCWSTR value) override { arguments_ = value ? value : L""; return S_OK; }
  HRESULT STDMETHODCALLTYPE get_Language(LPWSTR* value) override { return copyString(language_, value); }
  HRESULT STDMETHODCALLTYPE put_Language(LPCWSTR value) override { language_ = value ? value : L""; return S_OK; }
  HRESULT STDMETHODCALLTYPE get_TargetCompatibleBrowserVersion(LPWSTR* value) override { return copyString(version_, value); }
  HRESULT STDMETHODCALLTYPE put_TargetCompatibleBrowserVersion(LPCWSTR value) override { version_ = value ? value : L""; return S_OK; }
  HRESULT STDMETHODCALLTYPE get_AllowSingleSignOnUsingOSPrimaryAccount(BOOL* value) override { if (!value) return E_POINTER; *value = singleSignOn_; return S_OK; }
  HRESULT STDMETHODCALLTYPE put_AllowSingleSignOnUsingOSPrimaryAccount(BOOL value) override { singleSignOn_ = value; return S_OK; }
};

class Application {
  HINSTANCE instance_;
  HWND window_ = nullptr;
  HMODULE loader_ = nullptr;
  std::wstring temporaryFolder_, dataFolder_;
  ComPtr<ICoreWebView2Controller> controller_;
  ComPtr<ICoreWebView2> webview_;
  bool closing_ = false, tickPending_ = false, powerHeld_ = false;
  int exitCode_ = 0;

  void fail(const wchar_t* message, HRESULT error) {
    if (closing_) return;
    wchar_t code[32]; wsprintfW(code, L"\n\nHibakód: 0x%08X", static_cast<unsigned>(error));
    MessageBoxW(window_, (std::wstring(message) + code).c_str(), TITLE, MB_OK | MB_ICONERROR);
    exitCode_ = 1;
    DestroyWindow(window_);
  }

  void runtimeUnavailable() {
    if (closing_) return;
    if (MessageBoxW(window_, L"A Microsoft Edge WebView2 futtatókörnyezet hiányzik vagy nem indítható. Megnyissuk a Microsoft hivatalos letöltési oldalát?", TITLE, MB_YESNO | MB_ICONINFORMATION) == IDYES)
      ShellExecuteW(nullptr, L"open", L"https://developer.microsoft.com/microsoft-edge/webview2/", nullptr, nullptr, SW_SHOWNORMAL);
    exitCode_ = 1; DestroyWindow(window_);
  }

  bool extractResource(int id, const wchar_t* filename) {
    HRSRC resource = FindResourceW(instance_, MAKEINTRESOURCEW(id), RT_RCDATA);
    if (!resource) return false;
    HGLOBAL data = LoadResource(instance_, resource);
    const DWORD size = SizeofResource(instance_, resource);
    const void* bytes = data ? LockResource(data) : nullptr;
    if (!bytes || !size) return false;
    const std::wstring target = temporaryFolder_ + L"\\" + filename;
    HANDLE file = CreateFileW(target.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE) return false;
    DWORD written = 0;
    const bool ok = WriteFile(file, bytes, size, &written, nullptr) && written == size;
    CloseHandle(file);
    return ok;
  }

  bool prepareFiles() {
    PWSTR local = nullptr;
    if (FAILED(SHGetKnownFolderPath(FOLDERID_LocalAppData, KF_FLAG_CREATE, nullptr, &local))) return false;
    dataFolder_ = std::wstring(local) + L"\\DunahidCsengeto";
    CoTaskMemFree(local);
    const int created = SHCreateDirectoryExW(nullptr, dataFolder_.c_str(), nullptr);
    if (created != ERROR_SUCCESS && created != ERROR_ALREADY_EXISTS) return false;
    // A new, private subdirectory avoids DLL search-path substitution and
    // lets every release use exactly its own embedded loader and HTML.
    for (int attempt = 0; attempt < 16; ++attempt) {
      GUID id; if (FAILED(CoCreateGuid(&id))) return false;
      wchar_t guid[40]; StringFromGUID2(id, guid, 40);
      temporaryFolder_ = dataFolder_ + L"\\run-" + guid;
      if (CreateDirectoryW(temporaryFolder_.c_str(), nullptr))
        return extractResource(101, L"dunahid-csengeto.html") && extractResource(102, L"WebView2Loader.dll") &&
            extractResource(103, L"WebView2-LICENSE.txt") && extractResource(104, L"WebView2-NOTICE.txt");
      if (GetLastError() != ERROR_ALREADY_EXISTS) return false;
    }
    temporaryFolder_.clear();
    return false;
  }

  void resize() {
    if (!controller_ || IsIconic(window_)) return;
    RECT bounds; GetClientRect(window_, &bounds);
    if (bounds.right > 0 && bounds.bottom > 0) controller_->put_Bounds(bounds);
  }

  void heartbeat() {
    // One outstanding message at most: a busy webview cannot grow a queue.
    if (!webview_ || tickPending_ || closing_) return;
    tickPending_ = true;
    auto callback = new ScriptExecuted(IID_ScriptExecuted, [this](HRESULT, LPCWSTR) {
      tickPending_ = false; return S_OK;
    });
    const HRESULT result = webview_->ExecuteScript(L"window.dispatchEvent(new Event('dunahid-desktop-tick'));", callback);
    callback->Release();
    if (FAILED(result)) tickPending_ = false;
  }

  HRESULT controllerReady(HRESULT error, ICoreWebView2Controller* controller) {
    if (closing_) return S_OK;
    if (FAILED(error) || !controller) { fail(L"Nem indítható el az alkalmazás megjelenítője.", error); return S_OK; }
    controller_.retain(controller);
    HRESULT result = controller_->get_CoreWebView2(webview_.put());
    if (FAILED(result)) { fail(L"Nem érhető el a megjelenítő.", result); return S_OK; }
    ComPtr<ICoreWebView2Settings> settings;
    if (SUCCEEDED(webview_->get_Settings(settings.put()))) {
      settings->put_AreDevToolsEnabled(FALSE);
      settings->put_AreDefaultContextMenusEnabled(FALSE);
      settings->put_IsStatusBarEnabled(FALSE);
      settings->put_IsWebMessageEnabled(FALSE);
      settings->put_AreHostObjectsAllowed(FALSE);
    }
    ComPtr<ICoreWebView2_3> mapping;
    result = webview_->QueryInterface(IID_WebView3, reinterpret_cast<void**>(mapping.put()));
    if (SUCCEEDED(result)) result = mapping->SetVirtualHostNameToFolderMapping(HOST, temporaryFolder_.c_str(), COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_DENY_CORS);
    if (FAILED(result)) { fail(L"Frissítsd a Microsoft Edge WebView2 futtatókörnyezetet.", result); return S_OK; }

    EventRegistrationToken token;
    auto navigation = new NavigationStarting(IID_NavigationStarting, [](ICoreWebView2*, ICoreWebView2NavigationStartingEventArgs* args) {
      LPWSTR uri = nullptr;
      if (SUCCEEDED(args->get_Uri(&uri))) {
        const std::wstring destination(uri); CoTaskMemFree(uri);
        if (destination.rfind(L"https://dunahid.invalid/", 0) != 0) args->put_Cancel(TRUE);
      } else args->put_Cancel(TRUE);
      return S_OK;
    });
    result = webview_->add_NavigationStarting(navigation, &token); navigation->Release();
    if (FAILED(result)) { fail(L"Nem állítható be az alkalmazás navigációja.", result); return S_OK; }
    auto popup = new NewWindowRequested(IID_NewWindowRequested, [](ICoreWebView2*, ICoreWebView2NewWindowRequestedEventArgs* args) { return args->put_Handled(TRUE); });
    webview_->add_NewWindowRequested(popup, &token); popup->Release();
    auto failed = new ProcessFailed(IID_ProcessFailed, [this](ICoreWebView2*, ICoreWebView2ProcessFailedEventArgs*) {
      fail(L"A megjelenítő leállt. Indítsd újra a Dunahíd csengetőt; addig a jelzés nem működik.", E_FAIL); return S_OK;
    });
    webview_->add_ProcessFailed(failed, &token); failed->Release();

    auto script = new ScriptReady(IID_ScriptReady, [this](HRESULT error, LPCWSTR) {
      if (closing_) return S_OK;
      if (FAILED(error)) { fail(L"Nem állítható be az asztali időzítés.", error); return S_OK; }
      const HRESULT result = webview_->Navigate(HOME);
      if (FAILED(result)) fail(L"Nem tölthető be a csengető felülete.", result);
      return S_OK;
    });
    result = webview_->AddScriptToExecuteOnDocumentCreated(L"Object.defineProperty(window, '__DUNAHID_DESKTOP__', {value: true});", script);
    script->Release();
    if (FAILED(result)) { fail(L"Nem állítható be az asztali időzítés.", result); return S_OK; }
    // Keep the controller visible even when its parent window is minimized.
    controller_->put_IsVisible(TRUE);
    resize();
    powerHeld_ = SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED) != 0;
    if (!powerHeld_) MessageBoxW(window_, L"Az automatikus ébren tartás nem sikerült. A csengetéshez kapcsold ki a Windows automatikus alvó állapotát.", TITLE, MB_OK | MB_ICONEXCLAMATION);
    if (!SetTimer(window_, HEARTBEAT, 250, nullptr)) fail(L"Nem indítható el a csengető időzítője.", HRESULT_FROM_WIN32(GetLastError()));
    return S_OK;
  }

  void initializeWebView() {
    if (!prepareFiles()) { fail(L"Nem hozhatók létre az alkalmazás helyi fájljai.", HRESULT_FROM_WIN32(GetLastError())); return; }
    loader_ = LoadLibraryExW((temporaryFolder_ + L"\\WebView2Loader.dll").c_str(), nullptr, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
    if (!loader_) { fail(L"Nem tölthető be a Microsoft WebView2 betöltője.", HRESULT_FROM_WIN32(GetLastError())); return; }
    using CreateEnvironment = HRESULT (STDAPICALLTYPE*)(PCWSTR, PCWSTR, ICoreWebView2EnvironmentOptions*, ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler*);
    const auto create = reinterpret_cast<CreateEnvironment>(GetProcAddress(loader_, "CreateCoreWebView2EnvironmentWithOptions"));
    if (!create) { fail(L"Érvénytelen WebView2 betöltő.", E_FAIL); return; }
    auto options = new EnvironmentOptions();
    auto ready = new EnvironmentReady(IID_EnvironmentReady, [this](HRESULT error, ICoreWebView2Environment* environment) {
      if (closing_) return S_OK;
      if (FAILED(error) || !environment) {
        runtimeUnavailable(); return S_OK;
      }
      auto callback = new ControllerReady(IID_ControllerReady, [this](HRESULT error, ICoreWebView2Controller* controller) { return controllerReady(error, controller); });
      const HRESULT result = environment->CreateCoreWebView2Controller(window_, callback);
      callback->Release();
      if (FAILED(result)) fail(L"Nem indítható el a megjelenítő.", result);
      return S_OK;
    });
    const HRESULT result = create(nullptr, (dataFolder_ + L"\\WebView2").c_str(), options, ready);
    options->Release(); ready->Release();
    if (FAILED(result)) runtimeUnavailable();
  }

  static LRESULT CALLBACK windowProcedure(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
    auto app = reinterpret_cast<Application*>(GetWindowLongPtrW(window, GWLP_USERDATA));
    if (message == WM_NCCREATE) {
      app = static_cast<Application*>(reinterpret_cast<CREATESTRUCTW*>(lParam)->lpCreateParams);
      app->window_ = window;
      SetWindowLongPtrW(window, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(app));
    }
    if (!app) return DefWindowProcW(window, message, wParam, lParam);
    switch (message) {
      case WM_SIZE: app->resize(); return 0;
      case WM_TIMER: if (wParam == HEARTBEAT) app->heartbeat(); return 0;
      case WM_SETFOCUS: if (app->controller_) app->controller_->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC); return 0;
      case WM_MOVE: if (app->controller_) app->controller_->NotifyParentWindowPositionChanged(); return 0;
      case WM_DPICHANGED: { auto rect = reinterpret_cast<RECT*>(lParam); SetWindowPos(window, nullptr, rect->left, rect->top, rect->right - rect->left, rect->bottom - rect->top, SWP_NOZORDER | SWP_NOACTIVATE); return 0; }
      case WM_GETMINMAXINFO: {
        auto info = reinterpret_cast<MINMAXINFO*>(lParam);
        const UINT dpi = GetDpiForWindow(window);
        info->ptMinTrackSize = { MulDiv(480, dpi, 96), MulDiv(420, dpi, 96) }; return 0;
      }
      case WM_DESTROY:
        app->closing_ = true;
        KillTimer(window, HEARTBEAT);
        if (app->powerHeld_) { SetThreadExecutionState(ES_CONTINUOUS); app->powerHeld_ = false; }
        if (app->controller_) app->controller_->Close();
        PostQuitMessage(app->exitCode_); return 0;
    }
    return DefWindowProcW(window, message, wParam, lParam);
  }

public:
  explicit Application(HINSTANCE instance) : instance_(instance) {}
  int run(int show) {
    WNDCLASSEXW type{}; type.cbSize = sizeof(type); type.hInstance = instance_;
    type.lpszClassName = WINDOW_CLASS; type.lpfnWndProc = windowProcedure;
    type.hCursor = LoadCursorW(nullptr, IDC_ARROW); type.hIcon = LoadIconW(nullptr, IDI_APPLICATION);
    type.hbrBackground = reinterpret_cast<HBRUSH>(COLOR_WINDOW + 1);
    if (!RegisterClassExW(&type)) return 1;
    const HWND window = CreateWindowExW(0, WINDOW_CLASS, TITLE, WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, 1120, 860, nullptr, nullptr, instance_, this);
    if (!window) return 1;
    ShowWindow(window, show); UpdateWindow(window);
    initializeWebView();
    MSG message;
    while (GetMessageW(&message, nullptr, 0, 0) > 0) { TranslateMessage(&message); DispatchMessageW(&message); }
    return exitCode_;
  }
  void close() { webview_.reset(); controller_.reset(); }
  void removeTemporaryFiles() {
    if (loader_) { FreeLibrary(loader_); loader_ = nullptr; }
    if (!temporaryFolder_.empty()) {
      DeleteFileW((temporaryFolder_ + L"\\dunahid-csengeto.html").c_str());
      DeleteFileW((temporaryFolder_ + L"\\WebView2Loader.dll").c_str());
      DeleteFileW((temporaryFolder_ + L"\\WebView2-LICENSE.txt").c_str());
      DeleteFileW((temporaryFolder_ + L"\\WebView2-NOTICE.txt").c_str());
      RemoveDirectoryW(temporaryFolder_.c_str());
    }
  }
};
} // namespace

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int show) {
  // A second launch raises the first window instead of duplicating alarms.
  HANDLE singleton = CreateMutexW(nullptr, FALSE, L"Local\\DunahidCsengeto");
  if (!singleton) return 1;
  if (GetLastError() == ERROR_ALREADY_EXISTS) {
    const HWND previous = FindWindowW(WINDOW_CLASS, nullptr);
    if (previous) { if (IsIconic(previous)) ShowWindow(previous, SW_RESTORE); SetForegroundWindow(previous); }
    CloseHandle(singleton); return 0;
  }
  const HRESULT initialized = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
  if (FAILED(initialized)) { CloseHandle(singleton); return 1; }
  Application app(instance);
  const int result = app.run(show);
  app.close(); CoUninitialize(); app.removeTemporaryFiles();
  CloseHandle(singleton);
  return result;
}
