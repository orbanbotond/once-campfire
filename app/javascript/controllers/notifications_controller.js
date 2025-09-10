import { Controller } from "@hotwired/stimulus"
import { post } from "@rails/request.js"
import { pageIsTurboPreview } from "helpers/turbo_helpers"
import { onNextEventLoopTick } from "helpers/timing_helpers"
import { getCookie, setCookie } from "lib/cookie"

export default class extends Controller {
  static values = { subscriptionsUrl: String }
  static targets = [ "notAllowedNotice", "bell", "details" ]
  static classes = [ "attention" ]

  async connect() {
    console.debug('connect')
    if (!pageIsTurboPreview()) {
      console.debug('!pageIsTurboPreview()')
      if (window.notificationsPreviouslyReady) {
        console.debug('window.notificationsPreviouslyReady')
        onNextEventLoopTick(() => this.dispatch("ready"))
      } else {
        console.debug('!window.notificationsPreviouslyReady')
        const firstTimeReady = await this.isEnabled()

        this.#pulseBellButton()

        if (firstTimeReady) {
          onNextEventLoopTick(() => this.dispatch("ready"))
          window.notificationsPreviouslyReady = true
        } else {
          this.#showBellAlert()
        }
      }
    }
  }

  async attemptToSubscribe() {
    console.debug('attemptToSubscribe...');
    if (this.#allowed) {
      console.debug('allowed...done');

      const registration = await this.#serviceWorkerRegistration || await this.#registerServiceWorker()

      switch(Notification.permission) {
        case "denied":  { this.#revealNotAllowedNotice(); break }
        case "granted": { this.#subscribe(registration); break }
        case "default": { this.#requestPermissionAndSubscribe(registration) }
      }
    } else {
      this.#revealNotAllowedNotice()
    }

    this.#endFirstRun()
  }

  async isEnabled() {
    console.debug('isEnabled...');

    if (this.#allowed) {
      console.debug('allowed...done');

      const registration = await this.#serviceWorkerRegistration
      console.debug('serviceWorkerRegistration..done');
      console.debug(registration);

      const existingSubscription = await registration?.pushManager?.getSubscription()

      return Notification.permission == "granted" && registration && existingSubscription
    } else {
      return false
    }
  }

  get #allowed() {
    console.debug('allowed...');
    return navigator.serviceWorker && window.Notification
  }

  get #serviceWorkerRegistration() {
    console.debug('serviceWorkerRegistration...');
    console.debug('window.isSecureContext');
    console.debug(window.isSecureContext)

    return navigator.serviceWorker.getRegistration(window.location.host)
  }

  #registerServiceWorker() {
    console.debug("Registering serviceWorker");
    return navigator.serviceWorker.register("/service-worker.js")
  }

  #revealNotAllowedNotice() {
    this.notAllowedNoticeTarget.showModal()
    this.#openSingleOption()
  }

  #openSingleOption() {
    const visibleElements = this.detailsTargets.filter(item => !this.#isHidden(item))

    if (visibleElements.length === 1) {
      this.detailsTargets.forEach(item => item.toggleAttribute("open", item === visibleElements[0]))
    }
  }

  #showBellAlert() {
    this.bellTarget.querySelectorAll("img").forEach(img => img.toggleAttribute("hidden"))
  }

  #pulseBellButton() {
    console.debug('#pulseBellButton')

    if (!this.#hasSeenFirstRun) {
      this.bellTarget.classList.add(this.attentionClass)
    }
  }

  #endFirstRun() {
    this.bellTarget.classList.remove(this.attentionClass)
    this.#markFirstRunSeen()
  }

  async #subscribe(registration) {
    registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: this.#vapidPublicKey })
      .then(subscription => {
        this.#syncPushSubscription(subscription)
        this.dispatch("ready")
      })
  }

  async #syncPushSubscription(subscription) {
    const response = await post(this.subscriptionsUrlValue, { body: this.#extractJsonPayloadAsString(subscription), responseKind: "turbo-stream" })
    if (!response.ok) subscription.unsubscribe()
  }

  async #requestPermissionAndSubscribe(registration) {
    const permission = await Notification.requestPermission()
    if (permission === "granted") this.#subscribe(registration)
  }

  get #vapidPublicKey() {
    const encodedVapidPublicKey = document.querySelector('meta[name="vapid-public-key"]').content
    return this.#urlBase64ToUint8Array(encodedVapidPublicKey)
  }

  get #hasSeenFirstRun() {
    if (this.#isPWA) {
      return getCookie("notifications-pwa-first-run-seen")
    } else {
      return getCookie("notifications-first-run-seen")
    }
  }

  #markFirstRunSeen = (event) => {
    if (this.#isPWA) {
      setCookie("notifications-pwa-first-run-seen", true)
    } else {
      setCookie("notifications-first-run-seen", true)
    }
  }

  #extractJsonPayloadAsString(subscription) {
    const { endpoint, keys: { p256dh, auth } } = subscription.toJSON()
    return JSON.stringify({ push_subscription: { endpoint, p256dh_key: p256dh, auth_key: auth } })
  }

  // VAPID public key comes encoded as base64 but service worker registration needs it as a Uint8Array
  #urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - base64String.length % 4) % 4)
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")

    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }

    return outputArray
  }

  #isHidden(item) {
    return (item.offsetParent === null)
  }

  get #isPWA() {
    return window.matchMedia("(display-mode: standalone)").matches
  }
}
