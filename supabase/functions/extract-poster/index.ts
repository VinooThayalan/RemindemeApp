import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ExtractedInfo {
  name: string | null;
  date: string | null;
  time: string | null;
  end_date: string | null;
  end_time: string | null;
  location: string | null;
  description: string | null;
  ticket_url: string | null;
  participants: string | null;
  timezone: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { image_base64, user_api_key } = await req.json();

    if (!image_base64 || typeof image_base64 !== "string") {
      return new Response(
        JSON.stringify({ error: "image_base64 is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY") || user_api_key;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error:
            "No OpenAI API key configured. Set OPENAI_API_KEY as an edge function secret, or pass user_api_key in the request body.",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const systemPrompt = `You are an expert at extracting event information from posters and flyers.
Analyze the image and extract all available event details.
Return ONLY a JSON object with these fields (use null for any field you cannot determine):
{
  "name": "Event title/name",
  "date": "Start date in YYYY-MM-DD format (infer the year if not shown, use 2026 as current year)",
  "time": "Start time in HH:MM 24h format, or null if not specified",
  "end_date": "End date in YYYY-MM-DD format, or null",
  "end_time": "End time in HH:MM 24h format, or null",
  "location": "Venue name and/or address",
  "description": "Brief description or tagline from the poster",
  "ticket_url": "Any URL shown on the poster for tickets/registration",
  "participants": "Speakers, performers, hosts, or special guests mentioned",
  "timezone": "IANA timezone if mentioned or clearly implied (e.g. America/New_York), or null"
}
Do NOT include markdown formatting or explanations. Return only the JSON object.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract all event information from this poster image.",
              },
              {
                type: "image_url",
                image_url: {
                  url: image_base64.startsWith("data:")
                    ? image_base64
                    : `data:image/jpeg;base64,${image_base64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 500,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(
        JSON.stringify({ error: `OpenAI API error (${response.status}): ${errText}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({ error: "No content returned from vision API" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let extracted: ExtractedInfo;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      extracted = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({ error: "Failed to parse vision API response", raw: content }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ extracted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
