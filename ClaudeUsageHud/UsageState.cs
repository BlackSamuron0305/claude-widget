using System.Text.Json.Serialization;

namespace ClaudeUsageHud;

public class UsageState
{
    [JsonPropertyName("model")]
    public ModelInfo? Model { get; set; }

    [JsonPropertyName("rate_limits")]
    public RateLimits? RateLimits { get; set; }

    [JsonPropertyName("captured_at")]
    public long? CapturedAt { get; set; }
}

public class ModelInfo
{
    [JsonPropertyName("display_name")]
    public string? DisplayName { get; set; }
}

public class RateLimits
{
    [JsonPropertyName("five_hour")]
    public RateLimitInfo? FiveHour { get; set; }

    [JsonPropertyName("seven_day")]
    public RateLimitInfo? SevenDay { get; set; }
}

public class RateLimitInfo
{
    [JsonPropertyName("used_percentage")]
    public double? UsedPercentage { get; set; }

    [JsonPropertyName("resets_at")]
    public long? ResetsAt { get; set; }
}
