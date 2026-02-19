<script lang="ts">
    import { enhance, deserialize } from "$app/forms";
    import { registerCredential } from "$lib/auth/webauthn";
    import { goto } from "$app/navigation";
    import { untrack } from "svelte";

    const RegistrationStep = {
        Details: "details",
        OTP: "otp",
        Passkey: "passkey",
    } as const;

    type RegistrationStepType =
        (typeof RegistrationStep)[keyof typeof RegistrationStep];

    interface RegisterFormState {
        step?: RegistrationStepType;
        email?: string;
        error?: string;
        user?: { id: string; email: string };
    }

    let { form }: { form: RegisterFormState } = $props();

    let step = $derived(form?.step ?? RegistrationStep.Details);
    let loading = $state(false);
    let errorMessage = $state(untrack(() => form?.error) ?? "");

    $effect(() => {
        if (form?.error) errorMessage = form.error;
    });

    async function handlePasskeySetup() {
        if (!form || !form.user) {
            errorMessage = "Missing registration data.";
            return;
        }

        loading = true;
        errorMessage = "";

        try {
            // 1. Get Challenge via Server Action
            const challengeReq = await fetch("?/passkey_challenge", {
                method: "POST",
                body: new FormData(),
                headers: { "x-sveltekit-action": "true" },
            });
            const challengeRes = deserialize(await challengeReq.text());

            if (challengeRes.type !== "success") {
                throw new Error(
                    `Failed to get challenge: ${challengeRes.type}`,
                );
            }

            // This is actually the FULL configuration object from Go
            const optionsFromServer = challengeRes.data?.challenge;

            // 2. Browser Native Auth
            const credential = await registerCredential(optionsFromServer);

            // 3. Send New Key via Server Action
            const formData = new FormData();
            formData.append("credential", JSON.stringify(credential));

            const regReq = await fetch("?/passkey_register", {
                method: "POST",
                body: formData,
            });

            const regRes = await regReq.json();

            if (regRes.type === "redirect") {
                goto(regRes.location);
            } else if (regRes.type === "failure") {
                throw new Error("Server rejected passkey");
            }
        } catch (err: any) {
            errorMessage = err.message || "Passkey setup failed.";
            // setTimeout(() => goto("/error"), 2000); // Fallback to error page
        } finally {
            loading = false;
        }
    }
</script>

<div
    class="min-h-screen flex items-center justify-center bg-zinc-900 text-white font-sans"
>
    <div
        class="w-full max-w-md p-8 bg-zinc-800 rounded-xl shadow-2xl border border-zinc-700"
    >
        <h1 class="text-3xl font-bold mb-6 text-emerald-400">
            Join the Simulation
        </h1>

        {#if errorMessage}
            <div
                class="p-3 mb-4 bg-red-900/50 text-red-200 text-sm rounded border border-red-800"
                role="alert"
            >
                {errorMessage}
            </div>
        {/if}

        {#if step === RegistrationStep.Details}
            <form
                method="POST"
                action="?/initiate"
                use:enhance={() => {
                    loading = true;
                    errorMessage = "";
                    return async ({ update }) => {
                        loading = false;
                        update();
                    };
                }}
            >
                <div class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="flex flex-col">
                            <label
                                for="firstName"
                                class="text-xs text-zinc-400 mb-1 ml-1"
                                >First Name</label
                            >
                            <input
                                id="firstName"
                                name="firstName"
                                placeholder="Jane"
                                required
                                class="w-full p-3 bg-zinc-900 rounded border border-zinc-700 focus:border-emerald-500 outline-none"
                            />
                        </div>
                        <div class="flex flex-col">
                            <label
                                for="lastName"
                                class="text-xs text-zinc-400 mb-1 ml-1"
                                >Last Name</label
                            >
                            <input
                                id="lastName"
                                name="lastName"
                                placeholder="Doe"
                                required
                                class="w-full p-3 bg-zinc-900 rounded border border-zinc-700 focus:border-emerald-500 outline-none"
                            />
                        </div>
                    </div>

                    <div class="flex flex-col">
                        <label
                            for="email"
                            class="text-xs text-zinc-400 mb-1 ml-1"
                            >Email Address</label
                        >
                        <input
                            id="email"
                            type="email"
                            name="email"
                            placeholder="jane@example.com"
                            required
                            class="w-full p-3 bg-zinc-900 rounded border border-zinc-700 focus:border-emerald-500 outline-none"
                        />
                    </div>

                    <div class="flex flex-col">
                        <label
                            for="dob-input"
                            class="text-xs text-zinc-400 mb-1 ml-1"
                            >Date of Birth</label
                        >
                        <input
                            id="dob-input"
                            type="date"
                            name="dob"
                            required
                            class="w-full p-3 bg-zinc-900 rounded border border-zinc-700 focus:border-emerald-500 outline-none"
                        />
                    </div>

                    <button
                        disabled={loading}
                        class="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded transition-all"
                    >
                        {loading ? "Processing..." : "Next"}
                    </button>
                </div>
            </form>
        {:else if step === RegistrationStep.OTP}
            <form
                method="POST"
                action="?/verify"
                use:enhance={() => {
                    loading = true;
                    errorMessage = "";
                    return async ({ update }) => {
                        loading = false;
                        update();
                    };
                }}
            >
                <div class="space-y-6 text-center">
                    <p class="text-zinc-400">
                        Enter the 6-digit code sent to <span class="text-white"
                            >{form?.email}</span
                        >
                    </p>
                    <input type="hidden" name="email" value={form?.email} />

                    <div class="flex flex-col">
                        <label for="otp-code" class="sr-only"
                            >Verification Code</label
                        >
                        <input
                            id="otp-code"
                            name="code"
                            type="text"
                            maxlength="6"
                            placeholder="000 000"
                            class="w-full text-center text-3xl tracking-[0.5em] p-4 bg-zinc-900 rounded border border-zinc-700 focus:border-emerald-500 outline-none font-mono"
                        />
                    </div>

                    <button
                        disabled={loading}
                        class="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded transition-all"
                    >
                        {loading ? "Verifying..." : "Create Account"}
                    </button>
                </div>
            </form>
        {:else if step === RegistrationStep.Passkey}
            <div class="text-center space-y-6">
                <div class="text-5xl">🔐</div>
                <h2 class="text-xl font-semibold">Secure your Account</h2>
                <p class="text-zinc-400">
                    Create a Passkey for instant, passwordless login on this
                    device.
                </p>

                <button
                    onclick={handlePasskeySetup}
                    disabled={loading}
                    class="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded transition-all"
                >
                    {loading ? "Registering Key..." : "Create Passkey"}
                </button>

                <a
                    href="/"
                    class="block text-sm text-zinc-500 hover:text-zinc-300"
                >
                    Skip for now
                </a>
            </div>
        {/if}
    </div>
</div>
