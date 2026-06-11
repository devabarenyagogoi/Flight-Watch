using FlightWatch.Models;
using Microsoft.AspNetCore.SignalR;

public class FlightBroadcastService : BackgroundService
{
    private readonly OpenSkyService _openSkyService;
    private readonly IHubContext<FlightHub> _hubContext;
    private readonly int _intervalSeconds;
    private readonly IConfiguration _config;

    public FlightBroadcastService(OpenSkyService openSkyService, IHubContext<FlightHub> hubContext, IConfiguration config)
    {
        _openSkyService = openSkyService;
        _hubContext = hubContext;
        _config = config;
        _intervalSeconds = config.GetValue<int>("FlightWatch:BroadcastIntervalSeconds");

    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var flights = await _openSkyService.GetFlightsAsync();

                // Test mode — return only 1 flight
                if (_config.GetValue<bool>("FlightWatch:TestMode"))
                    flights = flights.Take(1).ToList();

                await _hubContext.Clients.All.SendAsync("ReceiveFlights", flights);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Broadcast error: {ex.Message}");
            }

            await Task.Delay(TimeSpan.FromSeconds(_intervalSeconds), stoppingToken);
        }
    }
}