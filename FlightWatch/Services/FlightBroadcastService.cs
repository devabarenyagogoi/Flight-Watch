using FlightWatch.Models;
using Microsoft.AspNetCore.SignalR;

public class FlightBroadcastService : BackgroundService
{
    private readonly OpenSkyService _openSkyService;
    private readonly IHubContext<FlightHub> _hubContext;

    public FlightBroadcastService(OpenSkyService openSkyService, IHubContext<FlightHub> hubContext)
    {
        _openSkyService = openSkyService;
        _hubContext = hubContext;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var flights = await _openSkyService.GetFlightsAsync();
                await _hubContext.Clients.All.SendAsync("ReceiveFlights", flights);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Broadcast error: {ex.Message}");
            }

            await Task.Delay(TimeSpan.FromSeconds(90), stoppingToken);
        }
    }
}