using FlightWatch.Models;
using System.Net.Http.Headers;
using System.Text.Json;

public class OpenSkyService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _config;
    private readonly string _baseUrl = "https://opensky-network.org/api";
    private readonly string _tokenUrl = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";

    private string? _cachedToken;
    private DateTime _tokenExpiresAt = DateTime.MinValue;

    private List<FlightState>? _cachedFlights;
    private DateTime _cacheExpiresAt = DateTime.MinValue;
    private readonly TimeSpan _cacheDuration = TimeSpan.FromSeconds(90);

    public OpenSkyService(HttpClient httpClient, IConfiguration config)
    {
        _httpClient = httpClient;
        _config = config;
    }

    private async Task<string> GetTokenAsync()
    {
        if (_cachedToken != null && DateTime.UtcNow < _tokenExpiresAt.AddSeconds(-30))
            return _cachedToken;

        var clientId = _config["OpenSky:ClientId"];
        var clientSecret = _config["OpenSky:ClientSecret"];

        var form = new FormUrlEncodedContent(new[]
        {
            new KeyValuePair<string, string>("grant_type", "client_credentials"),
            new KeyValuePair<string, string>("client_id", clientId!),
            new KeyValuePair<string, string>("client_secret", clientSecret!),
        });

        var response = await _httpClient.PostAsync(_tokenUrl, form);
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);

        _cachedToken = doc.RootElement.GetProperty("access_token").GetString();
        var expiresIn = doc.RootElement.GetProperty("expires_in").GetInt32();
        _tokenExpiresAt = DateTime.UtcNow.AddSeconds(expiresIn);

        return _cachedToken!;
    }

    public async Task<List<FlightState>> GetFlightsAsync()
    {
        if (_cachedFlights != null && DateTime.UtcNow < _cacheExpiresAt)
            return _cachedFlights;

        var token = await GetTokenAsync();
        var request = new HttpRequestMessage(HttpMethod.Get, $"{_baseUrl}/states/all?extended=1");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await _httpClient.SendAsync(request);
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);

        var flights = new List<FlightState>();
        var states = doc.RootElement.GetProperty("states");

        foreach (var state in states.EnumerateArray())
        {
            var arr = state.EnumerateArray().ToList();
            flights.Add(new FlightState
            {
                Icao24 = arr[0].GetString(),
                Callsign = arr[1].GetString()?.Trim(),
                OriginCountry = arr[2].GetString(),
                TimePosition = arr[3].ValueKind != JsonValueKind.Null ? arr[3].GetInt64() : null,
                LastContact = arr[4].ValueKind != JsonValueKind.Null ? arr[4].GetInt64() : null,
                Longitude = arr[5].ValueKind != JsonValueKind.Null ? arr[5].GetDouble() : null,
                Latitude = arr[6].ValueKind != JsonValueKind.Null ? arr[6].GetDouble() : null,
                BaroAltitude = arr[7].ValueKind != JsonValueKind.Null ? arr[7].GetDouble() : null,
                OnGround = arr[8].GetBoolean(),
                Velocity = arr[9].ValueKind != JsonValueKind.Null ? arr[9].GetDouble() : null,
                TrueTrack = arr[10].ValueKind != JsonValueKind.Null ? arr[10].GetDouble() : null,
                VerticalRate = arr[11].ValueKind != JsonValueKind.Null ? arr[11].GetDouble() : null,
                Sensors = arr[12].ValueKind != JsonValueKind.Null ? arr[12].ToString() : null,
                GeoAltitude = arr[13].ValueKind != JsonValueKind.Null ? arr[13].GetDouble() : null,
                Squawk = arr[14].ValueKind != JsonValueKind.Null ? arr[14].GetString() : null,
                Spi = arr[15].GetBoolean(),
                PositionSource = arr[16].ValueKind != JsonValueKind.Null ? arr[16].GetInt32() : null,
                Category = arr[17].ValueKind != JsonValueKind.Null ? arr[17].GetInt32() : null,
            });
        }

        _cachedFlights = flights.Where(f => f.Latitude.HasValue && f.Longitude.HasValue).ToList();
        _cacheExpiresAt = DateTime.UtcNow.Add(_cacheDuration);

        return _cachedFlights;
    }
}